rootProject.name = "TaktX Community Console"

// include the ingesters parent and its child modules so the tree is:
// :ingesters -> :ingesters:cassandra, :ingesters:inmemory
include(":ingesters", ":ingesters:inmemory")

// include the platform-service module
include(":platform-service")

// map the project directories explicitly
project(":ingesters").projectDir = file("ingesters")
project(":ingesters:inmemory").projectDir = file("ingesters/inmemory")
project(":platform-service").projectDir = file("platform-service")
