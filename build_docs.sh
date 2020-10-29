#!/bin/bash

branch=${master:-$1}

git checkout $branch && \
	git pull origin $branch && \
	( git branch -D docs || true ) && \
	git checkout -b docs && \
	yarn docs && \
	git add docs && \
	git commit -m "docs" && \
	git push origin docs --force
git checkout $branch
