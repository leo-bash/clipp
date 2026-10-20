.PHONY: install dev infra-up infra-down check pipeline-local generate

install:
	pnpm install

dev:
	pnpm dev

infra-up:
	docker compose up -d postgres redis

infra-down:
	docker compose down

check:
	pnpm check

pipeline-local:
	pnpm pipeline:local

generate:
	pnpm generate
