#!/bin/bash

# Setup script for Calmail environment configuration

echo "🚀 Setting up Calmail environment configuration..."

# Check if .env file already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists. Backing up to .env.backup"
    cp .env .env.backup
fi

# Create .env file with Clerk configuration template
cat > .env << EOF
# Clerk Configuration
# Get these values from your Clerk dashboard at https://dashboard.clerk.com/
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here

# Email/Password Authentication Configuration
# These are configured in your Clerk dashboard under User & Authentication
# No additional environment variables needed for email/password auth
EOF

echo "✅ .env file created successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Go to https://dashboard.clerk.com and create an account"
echo "2. Create a new application"
echo "3. Copy your Publishable Key from the API Keys section"
echo "4. Replace 'your_clerk_publishable_key_here' in the .env file with your actual key"
echo "5. In your Clerk dashboard, enable Email/Password authentication under User & Authentication → Email, Phone, Username"
echo ""
echo "🔑 Your .env file is ready to be configured!"
