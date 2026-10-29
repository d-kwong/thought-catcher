import { pool } from "./db.js";

try {
    const result = await pool.query(
        "SELECT current_database() AS database, current_user AS username"
    );

    console.log(result.rows);
} catch (error) {
    console.error("Database connection failed: ", error);
    process.exitCode = 1;
} finally {
    await pool.end();
}
