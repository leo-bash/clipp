.PHONY: install dev infra-up infra-down check

install:
	corepack pnpm install

dev:
	corepack pnpm dev

infra-up:
	docker compose up -d postgres redis

infra-down:
	docker compose down

check:
	corepack pnpm check
