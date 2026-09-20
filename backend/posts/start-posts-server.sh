#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Always force Java 25, even if JAVA_HOME is already set to something else —
# a stray older JDK on JAVA_HOME (separate from what's on PATH) breaks the
# build with an UnsupportedClassVersionError.
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home

./mvnw spring-boot:run
