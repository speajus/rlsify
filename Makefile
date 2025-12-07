.PHONY: help docker-up docker-down docker-restart docker-logs docker-clean docker-reset db-shell db-test ui-logs

# Default target
help:
	@echo "RLSify Docker Commands"
	@echo "======================"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          - Copy .env.example to .env"
	@echo ""
	@echo "Docker Management:"
	@echo "  make up             - Start all services"
	@echo "  make up-tools       - Start all services including pgAdmin"
	@echo "  make down           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make logs           - View logs from all services"
	@echo "  make clean          - Stop and remove containers"
	@echo "  make reset          - Stop and remove containers and volumes (fresh start)"
	@echo ""
	@echo "Service-Specific:"
	@echo "  make db-shell       - Open PostgreSQL shell"
	@echo "  make db-test        - Run RLS policy tests"
	@echo "  make ui-logs        - View UI logs"
	@echo "  make postgres-logs  - View PostgreSQL logs"
	@echo ""
	@echo "Development:"
	@echo "  make rebuild        - Rebuild and restart UI container"
	@echo "  make status         - Show status of all services"

# Setup
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ Created .env file from .env.example"; \
		echo "📝 Edit .env to customize your configuration"; \
	else \
		echo "⚠️  .env file already exists"; \
	fi

# Docker Management
up:
	docker-compose up -d
	@echo ""
	@echo "✅ RLSify is running!"
	@echo "🌐 UI: http://localhost:5174"
	@echo "🗄️  PostgreSQL: localhost:5432"
	@echo ""
	@echo "Run 'make logs' to view logs"
	@echo "Run 'make db-shell' to access the database"

up-tools:
	docker-compose --profile tools up -d
	@echo ""
	@echo "✅ RLSify is running with tools!"
	@echo "🌐 UI: http://localhost:5174"
	@echo "🗄️  PostgreSQL: localhost:5432"
	@echo "🔧 pgAdmin: http://localhost:5050"
	@echo ""

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

clean:
	docker-compose down
	@echo "✅ Containers removed (data preserved)"

reset:
	docker-compose down -v
	@echo "✅ Containers and volumes removed (fresh start)"
	@echo "Run 'make up' to start fresh"

# Service-Specific
db-shell:
	docker-compose exec postgres psql -U rlsify -d rlsify

db-test:
	@echo "Running RLS policy tests..."
	@docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
	-- Set user as Alice
	SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
	SELECT '✅ Current user:' AS status, * FROM auth.current_user_info;
	
	-- Test resources query
	SELECT '✅ Alice resources:' AS status, COUNT(*) AS count FROM resources;
	
	-- Switch to Bob
	SELECT auth.set_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
	SELECT '✅ Current user:' AS status, * FROM auth.current_user_info;
	SELECT '✅ Bob resources:' AS status, COUNT(*) AS count FROM resources;
	EOF

ui-logs:
	docker-compose logs -f ui

postgres-logs:
	docker-compose logs -f postgres

# Development
rebuild:
	docker-compose build ui
	docker-compose up -d ui
	@echo "✅ UI container rebuilt and restarted"

status:
	docker-compose ps

