#!/bin/sh

set -e

SOURCE_TEMPLATE="tmp/sam.yaml"
OUTPUT_TEMPLATE="bin/sam.yaml"

run-s build

aws cloudformation package \
  --template-file "${SOURCE_TEMPLATE}" \
  --output-template-file "${OUTPUT_TEMPLATE}" \
  --s3-bucket "${ARTIFACTS_BUCKET}" \
  --s3-prefix lambda

create_change_set() {
  local stack_name="$1"
  local api_domain="$2"
  local web_domain="$3"

  local template_url="https://${ARTIFACTS_BUCKET}.s3.amazonaws.com/${stack_name}/sam.yaml"
  local parameters=" \
    --stack-name ${stack_name} \
    --template-url ${template_url} \
    --change-set-name Deploy \
    --capabilities CAPABILITY_IAM \
    --parameters \
      ParameterKey=VpcRange,ParameterValue=${VPC_RANGE} \
      ParameterKey=EncryptionKeyId,ParameterValue=${ENCRYPTION_KEY_ID} \
      ParameterKey=SecretsBucket,ParameterValue=${SECRETS_BUCKET} \
      ParameterKey=SSHKeyName,ParameterValue=${stack_name} \
      ParameterKey=SSHKeyS3Path,ParameterValue=ssh/${stack_name}.pem \
      ParameterKey=SSHKeyPutRole,ParameterValue=${SSH_KEY_PUT_ROLE} \
      ParameterKey=SSHKeyGetRole,ParameterValue=${SSH_KEY_GET_ROLE} \
      ParameterKey=DomainZone,ParameterValue=${DOMAIN_ZONE} \
      ParameterKey=APIDomain,ParameterValue=${api_domain} \
      ParameterKey=WebDomain,ParameterValue=${web_domain} \
      ParameterKey=WebFirewallRanges,ParameterValue=${WEB_FIREWALL_RANGES} \
      ParameterKey=Auth0Domain,ParameterValue=${AUTH0_DOMAIN} \
      ParameterKey=Auth0CloudFormationClientID,ParameterValue=${AUTH0_CLIENT_ID} \
      ParameterKey=Auth0CloudFormationClientSecret,ParameterValue=${AUTH0_CLIENT_SECRET} \
      ParameterKey=Auth0CloudFormationSecretsRole,ParameterValue=${AUTH0_SECRETS_ROLE} "

  aws s3 cp "${OUTPUT_TEMPLATE}" "${template_url}"
  aws cloudformation create-change-set --change-set-type CREATE ${parameters} ||
    aws cloudformation create-change-set --change-set-type UPDATE ${parameters}
}

create_change_set backend-beta "${BETA_VPC_RANGE}" "beta.api.${DOMAIN_NAME}" "beta.${DOMAIN_NAME}"
create_change_set backend-release "${RELEASE_VPC_RANGE}" "api.${DOMAIN_NAME}" "${DOMAIN_NAME}"