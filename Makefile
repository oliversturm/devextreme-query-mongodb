export SHELL=/bin/bash
export PATH := ./node_modules/.bin:$(PATH)

SRC = index.js

TESTS = $(wildcard tests/*.js)

.PHONY: test publish

test:
	ID=`docker run -p=27017:27017 -d mongo:latest`; \
	   sleep 2; \
	mocha --harmony $(TESTS) ; \
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
