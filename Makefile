export SHELL=/bin/bash
export PATH := ./node_modules/.bin:$(PATH)

SRC = index.js

TESTS = $(wildcard src/*.test.js)
DISTTESTS = $(wildcard dist/*.test.js)

.PHONY: test publish

test:
	@echo "There are arbitrary issues with mongodb in docker, which lead"
	@echo "to timeouts in the tests. Trying multiple times can help,"
	@echo "or run the docker command manually without -d and then execute"
	@echo "the tests using npx mocha -u tdd src/index.test.js"
	@echo "Hopefully this will be fixed with a new docker image."
	@echo 
	ID=`docker run -p=27017:27017 --rm -d mongo:latest`; \
	   sleep 2; \
	mocha -u tdd $(TESTS) ; \
	docker stop $$ID

testonly:
	mocha -u tdd $(TESTS)

disttest:
	npm run prepare
	ID=`docker run -p=27017:27017 --rm -d mongo:latest`; \
	   sleep 2; \
	mocha -r babel-polyfill -u tdd $(DISTTESTS) ; \
	docker stop $$ID

disttestonly:
	mocha -r babel-polyfill -u tdd $(DISTTESTS)

test-coverage:
	npm run prepare
	ID=`docker run -p=27017:27017 --rm -d mongo:latest`; \
	   sleep 2; \
	nyc --reporter=text mocha -u tdd $(TESTS) ; \
	nyc report --reporter=lcov ; \
	docker stop $$ID

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
