#!/bin/sh
set -eu

awslocal sqs create-queue --queue-name saas-async >/dev/null

