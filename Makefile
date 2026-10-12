# Node runs in a container, as in the games that use this package.
TTY := $(shell [ -t 0 ] && echo -it)
NODE = docker run --rm $(TTY) -u $$(id -u):$$(id -g) -e HOME=/tmp -v $(CURDIR):/app -w /app node:22-alpine
# npm's login lives in ~/.npmrc on the host, mounted where the container's npm looks for it
NPM = docker run --rm -it -u $$(id -u):$$(id -g) -e HOME=/tmp -v $(HOME)/.npmrc:/tmp/.npmrc -v $(CURDIR):/app -w /app node:22-alpine npm

.PHONY: help install check test login publish

help: ## show this help
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "%-10s %s\n", $$1, $$2}'

install: ## install the dependencies (for the checks and tests here only)
	$(NODE) npm install

check: ## type check
	$(NODE) npm run check

test: ## run the unit tests
	$(NODE) npm test

login: ## sign in to npm (once): the token goes in ~/.npmrc
	touch $(HOME)/.npmrc
	$(NPM) login

publish: check test ## publish the version in package.json to npm, as a public package
	$(NPM) publish --access public
