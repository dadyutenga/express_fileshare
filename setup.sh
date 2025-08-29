#!/bin/bash

echo "🚀 ShareVault Setup Script"
echo "=========================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16 or higher."
    exit 1
fi

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL is not installed. Please install PostgreSQL and create a database."
    echo "   Then update the DATABASE_URL in your .env file."
else
    echo "✅ PostgreSQL is installed"
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one based on the provided template."
    exit 1
else
    echo "✅ .env file exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p uploads/thumbnails
mkdir -p uploads/temp
mkdir -p logs

# Run database migrations
echo "🗄️  Running database migrations..."
npx sequelize-cli db:migrate

# Seed database (optional)
read -p "Do you want to seed the database with sample data? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Seeding database..."
    npx sequelize-cli db:seed:all
fi

echo ""
echo "✅ Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Update your .env file with your actual credentials"
echo "2. Start the development server: npm run dev"
echo "3. Visit http://localhost:5000/api-docs for API documentation"
echo ""
echo "Happy coding! 🎉"
