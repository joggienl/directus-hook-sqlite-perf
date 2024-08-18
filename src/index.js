/** @typedef {import('knex').Knex} Knex */

function isNumeric(value) {
	const valueAsNumber = Number(value)
	return !isNaN(Number(valueAsNumber)) && typeof valueAsNumber === 'number'
}

/**
 * Check the Knex config for some settings and give warnings for known
 * improvements or warnings.for some sanity. Returns nothing.
 * @param {Knex} knex - Knex instance.
 * @return void
 */
function checkKnexConfig(knex, logger) {
	if (knex.client.pool.min !== 0) {
		logger.warn(
			'Suggestion: set DB_POOL__MIN to 0 to make sure unused connections are cleared',
		)
	}
	if (knex.client.pool.max > 1) {
		logger.info(
			'If you see SQLITE_BUSY errors consider setting DB_POOL__MAX to 1 to prevent those.',
		)
	}
}

/**
 * Get an array with pragmas to execute on the database.
 * Returns an array with statements to execute.
 *
 * @param env
 * @returns {String[]}
 */
function getPragmasFromEnv(env, logger) {
	const pragmas = []

	const PRAGMA_VALUES = {
		journal_mode: ['delete', 'truncate', 'persist', 'memory', 'wal', 'off'],
		synchronous: ['off', 'normal', 'full', 'extra'],
		temp_store: ['default', 'file', 'memory'],
	}

	const PRAGMA_DEFAULT_VALUES = {
		busy_timeout: 30000,
		journal_mode: 'wal',
		journal_size: 5242880,
		cache_size: -20000,
		synchronous: 'normal',
		temp_store: 'memory',
		mmap_size: 512000000,
		page_size: undefined, // No default
	}

	const pushPragma = (key, value, numeric, defaultValue) => {
		if (value) {
			if (numeric && !isNumeric(value)) {
				logger.error(`Please use a numeric value for ${key.toUpperCase()}`)
				value = defaultValue
			}
			pragmas.push(`PRAGMA ${key} = ${value};`)
		} else if (defaultValue !== undefined) {
			pragmas.push(`PRAGMA ${key} = ${defaultValue};`)
		}
	}

	pushPragma(
		'busy_timeout',
		env.DHSP_BUSY_TIMEOUT,
		true,
		DEFAULT_VALUES.busy_timeout,
	)

	pushPragma(
		'journal_mode',
		env.DHSP_JOURNAL_MODE &&
			PRAGMA_VALUES.journal_mode.includes(env.DHSP_JOURNAL_MODE.toLowerCase())
			? env.DHSP_JOURNAL_MODE
			: DEFAULT_VALUES.journal_mode,
	)

	pushPragma(
		'journal_size',
		env.DHSP_JOURNAL_SIZE,
		true,
		DEFAULT_VALUES.journal_size,
	)

	pushPragma('cache_size', env.DHSP_CACHE_SIZE, true, DEFAULT_VALUES.cache_size)

	pushPragma(
		'synchronous',
		env.DHSP_SYNCHRONOUS &&
			PRAGMA_VALUES.synchronous.includes(env.DHSP_SYNCHRONOUS.toLowerCase())
			? env.DHSP_SYNCHRONOUS
			: DEFAULT_VALUES.synchronous,
	)

	pushPragma(
		'temp_store',
		env.DHSP_TEMP_STORE &&
			PRAGMA_VALUES.temp_store.includes(env.DHSP_TEMP_STORE.toLowerCase())
			? env.DHSP_TEMP_STORE
			: DEFAULT_VALUES.temp_store,
	)

	pushPragma('mmap_size', env.DHSP_MMAP_SIZE, true, DEFAULT_VALUES.mmap_size)

	pushPragma('page_size', env.DHSP_PAGE_SIZE, true, DEFAULT_VALUES.page_size)

	return pragmas
}

export default async (_, { database, logger, env }) => {
	// Skip we are not using sqlite3.
	if (database.client.config.client !== 'sqlite3') return

	// Check the current configuration
	checkKnexConfig(database, logger)

	// Get values or set defaults for the settings we want to set.
	const pragmas = getPragmasFromEnv(env, logger)

	logger.debug(pragmas)

	// Acquire our database pool
	const pool = database.client.pool
	const acquire = pool.acquire()

	// Variable to store the connection
	let conn

	try {
		// Get the actual connection from the acquired pool
		conn = await acquire.promise

		// Run the SQL commands!
		await Promise.all(
			pragmas.map((pragma) => {
				return new Promise((resolve, reject) => {
					conn.run(pragma, (error) => {
						if (error) reject(error)
						else resolve()
					})
				})
			}),
		)

		// Great success!
		logger.info('Successfully loaded perf settings for SQLite.')
	} catch (error) {
		// Something went wrong!
		logger.error('Failed to set SQLite settings.')

		if (typeof error === 'string') {
			logger.error(error)
		}

		if (error.message && typeof error.message === 'string') {
			logger.error(error.message)
		} else {
			// Just try to log it.
			logger.error(error)
		}
	} finally {
		if (conn) {
			// Release the handle to our connection. Done!
			pool.release(conn)
		}
	}
}
