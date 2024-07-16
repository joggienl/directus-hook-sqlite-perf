export default async (_, {database, logger}) => {
	// Skip we are not using sqlite3;
	if (database.client.config.client !== 'sqlite3') return

	// Get values or set defaults for the settings we want to set;
	const journalMode = process.env.DHSP_JOURNAL_MODE || 'wal'
	const synchronous = process.env.DHSP_SYNCHRONOUS || 'normal'
	const tempStore = process.env.DHSP_TEMP_STORE || 'memory'
	const mmapSize = process.env.DHSP_MMAP_SIZE || '512000000'
	const pageSize = process.env.DHSP_PAGE_SIZE || false

	// Get debug mode;
	const dhsp_debug = process.env.DHSP_DEBUG === 'true' ||
		process.env.DHSP_DEBUG === true ||
		process.env.DHSP_DEBUG === 1

	// Acquire our database pool
	const pool = database.client.pool
	const acquire = pool.acquire()

	// Variable to store the connection
	let conn

	try {
		// Get the actual connection from the acquired pool
		conn = await acquire.promise

		// Run the SQL commands!
		if (dhsp_debug) logger.info(`set journal_mode to ${journalMode}`)
		await conn.run(`pragma journal_mode = ${journalMode}`)

		if (dhsp_debug) logger.info(`set synchronous to ${synchronous}`)
		await conn.run(`pragma synchronous = ${synchronous}`)

		if (dhsp_debug) logger.info(`set temp_store to ${tempStore}`)
		await conn.run(`pragma temp_store = ${tempStore}`)

		if (dhsp_debug) logger.info(`set mmap_size to ${mmapSize}`)
		await conn.run(`pragma mmap_size = ${mmapSize}`)

		if (pageSize) {
			// Only run this command if we got page_size from the environment
			if (dhsp_debug) logger.info(`set page_size to ${pageSize}`)
			await conn.run(`pragma page_size = ${pageSize}`)
		}

		// Great success!
		logger.info('Successfully loaded perf settings for SQLite.')
	} catch (error) {

		console.log(error)

		// Something went wrong. What was it?
		logger.error('Failed to set SQLite settings.')

		console.log(error)

		if (typeof error === 'string') {
			logger.error(error)
		}

		if (error.message && typeof error.message === 'string') {
			logger.error(error.message)
		}
	} finally {
		if (conn) {
			// Release the handle to our connection. Done!
			pool.release(conn)
		}
	}
}
