#!/bin/bash
# Validate Docker Setup
# This script checks that all required files are in place

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔍 Validating RLSify Docker Setup..."
echo ""

# Track validation status
ERRORS=0

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1 (missing)"
        ERRORS=$((ERRORS + 1))
    fi
}

# Function to check directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
    else
        echo -e "${RED}✗${NC} $1/ (missing)"
        ERRORS=$((ERRORS + 1))
    fi
}

echo "📋 Core Files:"
check_file "docker-compose.yml"
check_file ".env.example"
check_file "Makefile"
check_file ".dockerignore"

echo ""
echo "📚 Documentation:"
check_file "DOCKER.md"
check_file "DOCKER_SETUP_SUMMARY.md"
check_file "docker/README.md"
check_file "docker/QUICK_REFERENCE.md"

echo ""
echo "🗄️  PostgreSQL Configuration:"
check_dir "docker/postgres"
check_dir "docker/postgres/init"
check_file "docker/postgres/init/01-schema.sql"
check_file "docker/postgres/init/02-seed-data.sql"
check_file "docker/postgres/init/03-auth-helpers.sql"
check_file "docker/postgres/postgresql.conf"

echo ""
echo "🎨 UI Configuration:"
check_dir "docker/ui"
check_file "docker/ui/Dockerfile"
check_file "docker/ui/nginx.conf"

echo ""
echo "🔧 pgAdmin Configuration:"
check_dir "docker/pgadmin"
check_file "docker/pgadmin/servers.json"

echo ""
echo "📜 Scripts:"
check_dir "docker/scripts"
check_file "docker/scripts/demo-workflow.sh"
check_file "docker/scripts/test-rls-policies.sql"
check_file "docker/scripts/validate-setup.sh"

echo ""
echo "🔄 CI/CD:"
check_file ".github/workflows/docker-test.yml"

echo ""
echo "========================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All files present!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Copy environment file: cp .env.example .env"
    echo "2. Start services: make up"
    echo "3. Access UI: http://localhost:5174"
    echo "4. Run demo: ./docker/scripts/demo-workflow.sh"
else
    echo -e "${RED}❌ Found $ERRORS missing file(s)${NC}"
    exit 1
fi
echo "========================================="

