#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Check if a version argument is provided
if [ -z "$1" ]; then
  echo "Error: No version provided."
  echo "Usage: $0 <version>"
  exit 1
fi

# Check out the main branch
git checkout main

# Pull the latest changes from the main branch
git pull

# Check if the release/release-candidate branch exists
if git show-ref --quiet refs/heads/release/release-candidate; then
  # Check out the release/release-candidate branch
  git checkout release/release-candidate
else
  # Create the release/release-candidate branch from main
  git checkout -b release/release-candidate main
fi

# Merge the main branch into the release/release-candidate branch
git merge main

# Check out a new branch called release/release-candidate-$1
git checkout -b release/release-candidate-"$1"

# Set the version to $1 using npm version
npm version "$1" -m "Release v$1"

# Push the new release/release-candidate-$1 branch to origin
git push origin release/release-candidate-"$1"

# Push the tags to origin
git push origin --tags