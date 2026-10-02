CREATE TABLE products (id uuid primary key, name text, price int);
CREATE TABLE orders (id uuid primary key, customer_id uuid, total int, payment_intent text, status text default 'placed');
