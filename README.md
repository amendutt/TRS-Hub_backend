# Tech Refresh Solution Store

A responsive ecommerce storefront and admin portal for Tech Refresh Solution. It uses first-party customer/staff authentication (scrypt password hashes and secure sessions; no Firebase), Razorpay hosted checkout, signed payment verification/webhooks, optional transactional email, and persistent database storage.

## Quick test on Windows

Requirements: Node.js 22.13+ (the supplied environment uses Node 24).

1. Extract the ZIP. Double-click `Run-Local.bat` to start the store, or open the top-level project folder in VS Code. The project root contains `package.json` and `server.mjs`.
2. To use the VS Code terminal instead, run:

   ```powershell
   npm.cmd install
   npm.cmd start
   ```

3. Visit http://localhost:4173. The first run prints the local demo admin login in the terminal (email `admin@techrefreshsolution.com`, password `Refresh@123` unless you set your own `.env`). You can create a customer account and test catalog, cart, COD checkout, account, invoices, and the admin portal.

Local testing uses SQLite built into Node; it creates `store.sqlite` automatically. No MySQL server or `.env` file is required to test the site. This avoids the local MySQL `ECONNREFUSED` issue. The ZIP includes the Node dependencies and the launcher installs them if missing. COD works without provider accounts. For Razorpay online-payment tests, set test-mode credentials in `.env` and restart the app.

## Deploy on Render with MySQL

The included `render.yaml` configures a long-running Node service, health check, MySQL mode, and a persistent upload disk. This project is not configured for Vercel's serverless runtime.

1. Push this folder to a private GitHub repository and create a Render Blueprint from it.
2. Create a MySQL 8 database with a provider that allows connections from Render. Create the `tech_refresh_store` database, then run `database/schema.sql`. For local MySQL development, `database/local-user.sql` creates a least-privilege app account; managed providers normally supply their own database user.
3. Fill the Blueprint's unsynced environment values: `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `APP_URL`. Keep `MYSQL_SSL=true` for hosted MySQL. Choose a strong unique admin password before the first deployment.
4. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` using Razorpay test credentials first. Configure a Razorpay webhook at `https://YOUR-APP-URL/api/webhooks/razorpay`, subscribe to `payment.captured`, and save the webhook secret as `RAZORPAY_WEBHOOK_SECRET` in Render.
5. Deploy. Wait for `/healthz` to report healthy, then test registration, COD, admin management, and a test payment before enabling live credentials.

Do not commit `.env` or put provider secrets in `public/`. Complete Razorpay account activation and domain checks before accepting live payments.

## Optional order email

Set `RESEND_API_KEY`, `MAIL_FROM`, and `ADMIN_NOTIFICATION_EMAIL` in Render to send order confirmations and status emails. The sender domain/address must be verified with the provider. Email failure does not block an order.

## Features

- Storefront: home, category-specific product attributes, variants, search/filter, cart, wishlist, coupons, checkout, invoices and order tracking.
- Admin: products, categories, stock, orders, customers, coupons, banners, review moderation, reports and staff roles.
- Auth: first-party account registration/login, saved addresses, scrypt password hashes, HttpOnly/SameSite cookies, CSRF protection, no Firebase.
- Payments: COD and Razorpay hosted checkout. Paid orders require signature verification and provider confirmation; webhooks recover interrupted browser callbacks. Cancelling a paid Razorpay order requests a full provider refund.
- Server-side price, tax, shipping, coupon and stock validation; upload storage configuration; sign-in/account/checkout rate limits; health check.

## Storage and scale

For frictionless local testing, SQLite is the default in development. Render is explicitly configured to use MySQL. MySQL currently stores the application state as a single JSON document in `app_state`; this is appropriate for a small, single-instance launch, not a normalized/high-concurrency order system. Keep one app instance and back up the database and upload disk. Before scaling or handling substantial order volume, migrate products, inventory, orders, sessions and payments to relational tables with transactional inventory reservations. Shipping labels/carrier tracking, SMS/OTP, password reset and abandoned-cart campaigns require additional provider integrations.
