.PHONY: setup download data evaluate test validate

setup:
	uv sync --dev
	npm install

download:
	uv run python -m pipeline.download

data:
	uv run python -m pipeline.build

evaluate:
	uv run python -m pipeline.evaluate

test:
	uv run pytest
	npm test

validate:
	uv run ruff check pipeline tests
	uv run pytest
	npm run validate

