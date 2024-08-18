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
		logger.warn('Suggestion: set DB_POOL__MIN to 0 to make sure unused connections are cleared')
	}
	if (knex.client.pool.max > 1) {
		logger.info('If you see SQLITE_BUSY errors consider setting DB_POOL__MAX to 1 to prevent those.')
	}
}

/**
 * Get an array with pragmas to execute on the database.
 * Returns an array with statements to execute.
 *
 * @param env
 * @returns {*[]}
 */
function getPragmasFromEnv(env, logger) {
	const pragmas = []

	const pragmaValues = {
		'journal_mode': ['delete', 'truncate', 'persist', 'memory', 'wal', 'off'],
		'synchronous': ['off', 'normal', 'full', 'extra'],
		'temp_store': ['default', 'file', 'memory'],
	}

	if (env.DHSP_BUSY_TIMEOUT) {
		if (isNumeric(env.DHSP_BUSY_TIMEOUT)) {
			pragmas.push(`PRAGMA busy_timeout = ${env.DHSP_BUSY_TIMEOUT};`)
		} else {
			logger.error('Please use a numeric value for DHSP_BUSY_TIMEOUT')
			pragmas.push(`PRAGMA busy_timeout = 30000;`)
		}
	} else {
		// Set busy_timeout to prevent (some) SQLITE_BUSY errors from happening.
		// Set it to 30 seconds by default.
		pragmas.push(`PRAGMA busy_timeout = 30000;`)
	}

	if (env.DHSP_JOURNAL_MODE &&
		pragmaValues.journal_mode.includes(env.DHSP_JOURNAL_MODE.toLowerCase())) {
		pragmas.push(`PRAGMA journal_mode = ${env.DHSP_JOURNAL_MODE};`)
	} else {
		// This extension forces WAL mode as default.
		pragmas.push(`PRAGMA journal_mode = wal;`)
	}

	if (env.DHSP_JOURNAL_SIZE) {
		if (isNumeric(env.DHSP_JOURNAL_SIZE)) {
			pragmas.push(`PRAGMA journal_size = ${env.DHSP_JOURNAL_SIZE};`)
		} else {
			logger.error('Please use a numeric value for DHSP_JOURNAL_SIZE')
			// 5MB default for max wal file size
			pragmas.push(`PRAGMA journal_size = 5242880;`)
		}
	} else {
		// 5MB default for max wal file size
		pragmas.push(`PRAGMA journal_size = 5242880;`)
	}

	if (env.DHSP_CACHE_SIZE) {
		if (isNumeric(env.DHSP_CACHE_SIZE)) {
			pragmas.push(`PRAGMA cache_size = ${env.DHSP_CACHE_SIZE};`)
		} else {
			logger.error('Please use a numeric value for DHSP_CACHE_SIZE')
			// set journal_size to negative number to improve read speeds
			pragmas.push(`PRAGMA cache_size = -20000;`)
		}
	} else {
		// set journal_size to negative number to improve read speeds
		pragmas.push(`PRAGMA cache_size = -20000;`)
	}

	if (env.DHSP_SYNCHRONOUS &&
		pragmaValues.synchronous.includes(env.DHSP_SYNCHRONOUS.toLowerCase())) {
		pragmas.push(`PRAGMA synchronous = ${env.DHSP_SYNCHRONOUS};`)
	} else {
		// This extension sets synchronous to normal by default
		pragmas.push(`PRAGMA synchronous = normal;`)
	}

	if (env.DHSP_TEMP_STORE &&
		pragmaValues.temp_store.includes(env.DHSP_TEMP_STORE.toLowerCase())) {
		pragmas.push(`PRAGMA temp_store = ${env.DHSP_TEMP_STORE};`)
	} else {
		// This extension sets memory as default location for temporary things
		pragmas.push(`PRAGMA temp_store = memory;`)
	}

	if (env.DHSP_MMAP_SIZE) {
		if (isNumeric(env.DHSP_MMAP_SIZE)) {
			pragmas.push(`PRAGMA mmap_size = ${env.DHSP_MMAP_SIZE};`)
		} else {
			logger.error('Please use a numeric value for DHSP_MMAP_SIZE')
			// This extension will set mmap_size to 512MB by default
			pragmas.push(`PRAGMA mmap_size = 512000000;`)
		}
	} else {
		// This extension will set mmap_size to 512MB by default
		pragmas.push(`PRAGMA mmap_size = 512000000;`)
	}

	if (env.DHSP_PAGE_SIZE) {
		if (isNumeric(env.DHSP_PAGE_SIZE)) {
			pragmas.push(`PRAGMA page_size = ${env.DHSP_PAGE_SIZE};`)
		} else {
			logger.error('Please use a numeric value for DHSP_PAGE_SIZE')
			// We do not set a default value for page_size!
		}
	}

	return pragmas
}

export default async (_, {database, logger, env}) => {
	// Skip we are not using sqlite3;
	if (database.client.config.client !== 'sqlite3') return

	// Check the current configuration
	checkKnexConfig(database, logger)

	// Get values or set defaults for the settings we want to set;
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
		await Promise.all(pragmas.map((pragma) => {
			return new Promise((resolve, reject) => {
				conn.run(pragma, (error) => {
					if (error) reject(error);
					else resolve();
				});
			})
		}))

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
