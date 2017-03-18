#!/bin/sh

set -e

SWAGGER_API="${PWD}/api/swagger/swagger.yaml"
SWAGGER_DIST="${PWD}/node_modules/swagger-ui/dist"
S3_PATH="s3://${ARTIFACTS_BUCKET}/api/${BACKEND_STAGE}/"

cp "${SWAGGER_API}" "${SWAGGER_DIST}"
cd "${SWAGGER_DIST}"
rm -f swagger-ui.js
sed -i 's/swagger-ui\.js/swagger-ui.min.js/' index.html
sed -i 's/url: url,$/url: url, validatorUrl: null,/' index.html
aws s3 sync . "${S3_PATH}"