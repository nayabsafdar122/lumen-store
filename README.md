# Lumen — Full E-commerce Store

A complete online store: a polished **storefront website** and a production-ready **REST API**, built with Node.js, Express 5 and Sequelize. Runs locally on SQLite with zero setup and on PostgreSQL in production.

## Features

**Storefront** (`public/`, plain HTML/CSS/JS — no build step)
- Home page with auto-playing hero carousel, departments, deals, best sellers, top rated, new arrivals, testimonials, brands and newsletter sign-up
- ~150 real products with real photos (downloaded by `npm run seed` from the free DummyJSON catalog; a built-in catalog is used if you're offline)
- Instant search with suggestions (press `/` to focus)
- Shop page with filters (department, brand, price range, rating, on sale, in stock), 7 sort options, grid/list view and pagination
- Product page with image gallery & zoom, sale pricing, stock status, related products and recently viewed
- **Reviews & ratings**: star breakdown, sort/filter, "helpful" votes, verified-purchase badges, write/delete your own review
- **Wishlist**, quick-view pop-up, slide-out cart with free-shipping progress bar
- **Checkout** with promo codes (`WELCOME10`, `SAVE20`, `LUMEN25`), shipping calculation and a confetti confirmation
- Order history with tracking timeline, cancel, and "buy again"
- Account page (profile, password change), **Contact & feedback** form with star rating, FAQ
- **Admin dashboard**: revenue chart, order status, top sellers, low stock; manage products, orders, reviews, feedback inbox, coupons and newsletter subscribers
- Dark mode, mobile-friendly layout, accessible markup

**API**: JWT auth, roles, validation (zod), rate limiting, Helmet security headers, transactions for checkout & stock, 27 automated tests.

## 1. Run it locally (VS Code)

Requires **Node.js 20+** ([download](https://nodejs.org)).

Open the folder in VS Code, then open a terminal (**Terminal → New Terminal**) and run:

```bash
npm install          # install dependencies
cp .env.example .env # Windows PowerShell: copy .env.example .env
npm run seed:reset   # create tables + download the product catalog + demo data
npm run dev          # start the server with auto-reload
```

Open <http://localhost:4000> to see the store. Use the demo accounts below (the sign-in box has one-click buttons for them). Log in as admin to see the **Admin** dashboard.

**Demo accounts** (created by the seed):

| Role     | Email                  | Password      |
| -------- | ---------------------- | ------------- |
| Admin    | admin@example.com      | admin12345    |
| Customer | customer@example.com   | customer123   |

**Try requests inside VS Code:** install the *REST Client* extension, open `requests.http` and click **Send Request** above any block.

**Debugging:** press **F5** and choose *Debug API* (config in `.vscode/launch.json`).

Other commands:

```bash
npm start            # run without auto-reload (what production uses)
npm test             # run the test suite
npm run seed:reset   # wipe the database and re-seed
```

---

## 2. API reference

Base URL: `http://localhost:4000/api`. The frontend lives in `public/` (plain HTML/CSS/JS, no build step) and is served by the same server. Send `Authorization: Bearer <token>` on 🔒 routes.
**All prices are integers in cents** (`2599` = $25.99).

### Auth
| Method | Path             | Auth | Body |
| ------ | ---------------- | ---- | ---- |
| POST   | `/auth/register` | –    | `{ name, email, password }` (min 8 chars) |
| POST   | `/auth/login`    | –    | `{ email, password }` → `{ user, token }` |
| GET    | `/auth/me`       | 🔒   | – |

### Categories
| Method | Path              | Auth     |
| ------ | ----------------- | -------- |
| GET    | `/categories`     | –        |
| POST   | `/categories`     | 🔒 admin — `{ name }` |
| PATCH  | `/categories/:id` | 🔒 admin — `{ name }` |
| DELETE | `/categories/:id` | 🔒 admin |

### Products
| Method | Path            | Auth |
| ------ | --------------- | ---- |
| GET    | `/products`     | – query: `search`, `category` (slug), `minPrice`, `maxPrice`, `inStock=true`, `sort` (`newest`, `price_asc`, `price_desc`, `name`), `page`, `limit` |
| GET    | `/products/:id` | – |
| POST   | `/products`     | 🔒 admin — `{ name, description?, priceCents, stock?, imageUrl?, isActive?, categoryId? }` |
| PATCH  | `/products/:id` | 🔒 admin — any subset of the above |
| DELETE | `/products/:id` | 🔒 admin — soft delete (hidden, kept for order history) |

### Cart (🔒 logged-in user)
| Method | Path                     | Body |
| ------ | ------------------------ | ---- |
| GET    | `/cart`                  | – returns items, `itemCount`, `subtotalCents` |
| POST   | `/cart/items`            | `{ productId, quantity? }` (adds to existing qty) |
| PATCH  | `/cart/items/:productId` | `{ quantity }` |
| DELETE | `/cart/items/:productId` | – |
| DELETE | `/cart`                  | – empties the cart |

### Orders (🔒 logged-in user)
| Method | Path                 | Notes |
| ------ | -------------------- | ----- |
| POST   | `/orders`            | Checkout: `{ shippingAddress: { fullName, line1, line2?, city, state?, postalCode, country } }` |
| GET    | `/orders`            | Your orders (admins see all). Query: `status`, `page`, `limit` |
| GET    | `/orders/:id`        | |
| POST   | `/orders/:id/cancel` | Only while `pending`; stock is returned |
| PATCH  | `/orders/:id/status` | 🔒 admin — `{ status }`. Allowed: pending→paid/cancelled, paid→shipped/cancelled, shipped→delivered |

Errors always look like: `{ "error": { "message": "...", "details": [...] } }`.

---

## 3. Deploy

### Vercel (this project is ready for it)
`vercel.json` serves the storefront (`public/`) from Vercel's CDN and runs the API (`api/index.js` → `src/app.js`) as a serverless function.

1. Import the GitHub repo in Vercel (framework preset **Other** — `vercel.json` sets everything).
2. Add the env var `JWT_SECRET` (a long random string).
3. Deploy. On first request the API creates its tables and loads the catalog automatically.

> **Demo vs. persistent data:** without a database URL the Vercel deployment uses a temporary SQLite file, so orders, reviews and new accounts reset whenever Vercel starts a fresh instance — fine for a demo. For permanent data, open the project in Vercel → **Storage → Create Database → Neon (Postgres)** and connect it; Vercel adds `DATABASE_URL` automatically and the app switches to Postgres on the next deploy.

### Render
Push to GitHub → render.com → **New → Blueprint** → pick the repo. `render.yaml` creates the API and a Postgres database.

### Docker (any VPS / Fly.io / Cloud Run)
```bash
docker build -t lumen-store .
docker run -p 4000:4000 -e DATABASE_URL=postgres://... -e JWT_SECRET=... lumen-store
```

Generate a strong secret with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 4. Project structure

```
api/index.js          Vercel serverless entry (re-exports src/app.js)
src/
  app.js              Express app: middleware + routes
  server.js           Starts the server, connects DB, creates tables
  config/             Environment variables
  db/                 Database connection (SQLite locally, Postgres if DATABASE_URL)
  models/             User, Category, Product, CartItem, Order, OrderItem
  middleware/         auth (JWT + admin), validate (zod), error handling
  routes/             auth, categories, products, cart, orders
  scripts/seed.js     Demo data
public/               Storefront: index.html, styles.css, app.js
tests/api.test.js     End-to-end API tests
requests.http         Ready-made requests for the VS Code REST Client
render.yaml           Render blueprint
Dockerfile
```

## Next steps you might add
- Real payments (Stripe Checkout + webhook that marks orders `paid`)
- Image uploads (S3 / Cloudinary)
- Database migrations (`sequelize-cli`) instead of `sync()` once your schema stabilises
- Password reset emails
