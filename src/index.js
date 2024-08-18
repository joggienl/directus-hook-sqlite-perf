import { promisify } from 'node:util'

/** @typedef {import('knex').Knex} Knex */
/**
 * Checks if a given value is numeric.
 * @param {any} value - Value to check.
 * @return {boolean} - True if the value is numeric, otherwise false.
 */
function isNumeric(value) {
	const valueAsNumber = Number(value)
	return !isNaN(valueAsNumber)
}

/**
 * Check the Knex config for some settings and give warnings for known improvements or warnings for some sanity.
 * @param {Knex} knex - Knex instance.
 * @param {Object} logger - Logger instance.
 * @returns {void}
 */
function checkKnexConfig(knex, logger) {
	const MIN_POOL = 0
	const MAX_POOL = 1
	if (knex.client.pool.min !== MIN_POOL) {
		logger.warn(
			'Suggestion: set DB_POOL__MIN to 0 to make sure unused connections are cleared',
		)
	}
	if (knex.client.pool.max > MAX_POOL) {
		logger.info(
			'If you see SQLITE_BUSY errors consider setting DB_POOL__MAX to 1 to prevent those.',
		)
	}
}

/**
 * Get an array with pragmas to execute on the database.
 * @param {Object} env - Environment variables.
 * @param {Object} logger - Logger instance.
 * @returns {String[]} - Array of SQL pragma statements.
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

	const pushPragma = (key, value, isNumericFlag, defaultValue) => {
		if (value !== undefined) {
			if (isNumericFlag && !isNumeric(value)) {
				logger.error(
					`Please use a numeric value for ${key.toUpperCase()}`,
				)
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
		PRAGMA_DEFAULT_VALUES.busy_timeout,
	)
	pushPragma(
		'journal_mode',
		env.DHSP_JOURNAL_MODE &&
			PRAGMA_VALUES.journal_mode.includes(
				env.DHSP_JOURNAL_MODE.toLowerCase(),
			)
			? env.DHSP_JOURNAL_MODE
			: PRAGMA_DEFAULT_VALUES.journal_mode,
	)
	pushPragma(
		'journal_size',
		env.DHSP_JOURNAL_SIZE,
		true,
		PRAGMA_DEFAULT_VALUES.journal_size,
	)
	pushPragma(
		'cache_size',
		env.DHSP_CACHE_SIZE,
		true,
		PRAGMA_DEFAULT_VALUES.cache_size,
	)
	pushPragma(
		'synchronous',
		env.DHSP_SYNCHRONOUS &&
			PRAGMA_VALUES.synchronous.includes(
				env.DHSP_SYNCHRONOUS.toLowerCase(),
			)
			? env.DHSP_SYNCHRONOUS
			: PRAGMA_DEFAULT_VALUES.synchronous,
	)
	pushPragma(
		'temp_store',
		env.DHSP_TEMP_STORE &&
			PRAGMA_VALUES.temp_store.includes(env.DHSP_TEMP_STORE.toLowerCase())
			? env.DHSP_TEMP_STORE
			: PRAGMA_DEFAULT_VALUES.temp_store,
	)
	pushPragma(
		'mmap_size',
		env.DHSP_MMAP_SIZE,
		true,
		PRAGMA_DEFAULT_VALUES.mmap_size,
	)
	pushPragma(
		'page_size',
		env.DHSP_PAGE_SIZE,
		true,
		PRAGMA_DEFAULT_VALUES.page_size,
	)

	return pragmas
}

/**
 * Sets pragma statements on a database connection.
 * @param {Object} connection - Database connection.
 * @param {Object} env - Environment variables.
 * @param {Object} logger - Logger instance.
 * @returns {Promise<void>}
 */
async function setPragmasOnConnection(connection, env, logger) {
	const pragmas = getPragmasFromEnv(env, logger)
	logger.debug(pragmas)
	const runAsync = promisify(connection.run.bind(connection))

	for (const pragma of pragmas) {
		try {
			await runAsync(pragma)
		} catch (error) {
			logger.error(error)
			throw error
		}
	}
}

/**
 * Main function for setting up SQLite pragmas.
 * @param {Object} _ - Unused first argument.
 * @param {Object} params - Parameters.
 * @param {Object} params.database - Database object.
 * @param {Object} params.logger - Logger object.
 * @param {Object} params.env - Environment variables.
 * @returns {Promise<void>}
 */
export default async function (_, { database, logger, env }) {
	// Skip if we are not using sqlite3.
	if (database.client.config.client !== 'sqlite3') return

	if (env['PM2_INSTANCES'] && env['PM2_INSTANCES'] > 1)
		throw new Error(
			'Multiple PM2 instances is currently not supported for this extension!\nSet PM2_INSTANCES to 1',
		)

	// Check the current configuration.
	checkKnexConfig(database, logger)

	const pool = database.client.pool
	const connections = []

	// Add event handler for new connections.
	pool.on('createSuccess', async (eventId, resource) => {
		logger.debug(`executing pragmas on new connection: ${eventId}`)
		try {
			await setPragmasOnConnection(resource, env, logger)
			logger.debug('🔥 pragmas loaded!')
		} catch (error) {
			logger.error(error)
		}
	})

	try {
		logger.debug(`try to acquire ${database.client.pool.max} connections!`)
		for (let count = 0; count < database.client.pool.max; count += 1) {
			const acquire = pool.acquire()
			const conn = await acquire.promise
			connections.push(conn)
		}

		// Set PRAGMA statements on each connection.
		for (const conn of connections) {
			await setPragmasOnConnection(conn, env, logger)
		}
		logger.debug('🔥 pragmas loaded!')
		logger.info('Successfully loaded perf settings for SQLite.')
	} catch (error) {
		// Handle the error.
		logger.error('Failed to set SQLite settings.')
		logger.error(error instanceof Error ? error.message : error)
	} finally {
		// Release connections.
		for (const conn of connections) {
			pool.release(conn)
		}
	}
}
