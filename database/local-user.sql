-- Run this locally as a MySQL administrator after schema.sql.
-- Use the same password in .env as MYSQL_PASSWORD.
CREATE USER IF NOT EXISTS 'trs_app'@'localhost' IDENTIFIED BY 'change_this_database_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON tech_refresh_store.* TO 'trs_app'@'localhost';
FLUSH PRIVILEGES;
