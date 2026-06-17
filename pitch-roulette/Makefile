.PHONY: test test-unit test-integration test-e2e test-frontend install-dev seed

install-dev:
	cd backend && pip install -r requirements-dev.txt
	cd frontend && npm ci

test: test-unit test-integration

test-unit:
	cd backend && pytest tests/unit -q --cov=services --cov-report=term-missing

test-integration:
	cd backend && pytest tests/integration -q

test-frontend:
	cd frontend && npm run test:unit

test-e2e:
	cd frontend && npm run test:e2e

seed:
	cd backend && python scripts/seed_test_data.py
