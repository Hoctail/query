#!/bin/bash

git checkout master && \
	git pull origin master && \
	( git branch -D docs || true ) && \
	git checkout -b docs && \
	docma && \
	git add docs && \
	git commit -m "docs" && \
git checkout master

