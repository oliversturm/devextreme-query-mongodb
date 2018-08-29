export SHELL=/bin/bash
export PATH := ./node_modules/.bin:$(PATH)

SRC = index.js

TESTS = $(wildcard src/*.test.js)
DISTTESTS = $(wildcard dist/*.test.js)

.PHONY: test publish

test:
	ID=`docker run -p=27017:27017 -d mongo:latest`; \
	   sleep 2; \
	mocha -u tdd $(TESTS) ; \
	docker kill $$ID

disttest:
	npm run prepare
	ID=`docker run -p=27017:27017 -d mongo:latest`; \
	   sleep 2; \
	mocha -u tdd $(DISTTESTS) ; \
	docker kill $$ID

test-coverage:
	npm run prepare
	ID=`docker run -p=27017:27017 -d mongo:latest`; \
	   sleep 2; \
	nyc --reporter=text mocha -u tdd $(TESTS) ; \
	nyc report --reporter=lcov ; \
	docker kill $$ID

publish: 
	@echo "MAKE SURE CHANGES HAVE BEEN PUSHED TO GITHUB."
	@echo "Current version from package.json:"
	grep --color "version" package.json
	@while [ -z "$$NEWVERSION" ]; do \
		read -p "Enter the new version: " NEWVERSION; \
	done ; \
	npm version $$NEWVERSION; \
	git push --tags && \
	npm publish 
