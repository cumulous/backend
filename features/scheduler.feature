Feature: Schedule a job on a cluster
  As a user of our clusters
  I want to easily submit a job to a cluster
  So that I don't have to worry about job scheduling

Scenario: Submitting a job to a cluster
  Given I am provided with a job API
  When I submit a job using this API
  Then I should get a response with a job ID