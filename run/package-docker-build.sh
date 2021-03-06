#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )"/.. && pwd )"
source "$ROOT/run/common.sh"

if [[ ! -f Dockerfile ]]; then
  exit 0
fi

container="streamplace/$PACKAGE_NAME:latest"

info "Building container for $PACKAGE_NAME"
docker build -t $container .
containerID="$(docker inspect "$container" | jq -r '.[].Id')"

if [[ "$LOCAL_DEV" == "true" ]]; then
  info "Deploying all pods that utilize $container"
  query=".items[] | select(.spec.containers[].image == \"$container\") | .metadata.name"
  pods="$(kubectl get -o json pods | jq -r "$query")"
  for pod in $pods; do
    kubectl delete pod $pod
  done
fi
