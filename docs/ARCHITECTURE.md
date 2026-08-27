# Architecture

A stateless modular monolith (Express API) plus separate BullMQ worker and React web app. PostgreSQL is the source of truth; Redis is coordination, cache, rate-limit, and queue infrastructure. Domain packages are intentionally separable for later service extraction.
