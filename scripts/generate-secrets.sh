#!/usr/bin/env bash
# Generate secure values for Vercel deployment

set -e

echo "🔐 Secure Secrets Generator"
echo "============================"
echo ""

# Generate JWT Secret
echo "Generating JWT_SECRET (32+ characters)..."
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET"
echo ""

# Options for admin password
echo "Admin password options:"
echo "1. Use provided password"
echo "2. Generate secure random password"
echo ""
read -p "Choose (1-2) [default: 2]: " choice

case $choice in
  1)
    read -p "Enter admin password: " ADMIN_PASSWORD
    ;;
  *)
    echo "Generating secure random password..."
    # Generate 16-char password with mix of upper, lower, digits, symbols
    ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '\n' | tr '+/' 'Ab' | cut -c1-16)
    ;;
esac

echo "ADMIN_PASSWORD=$ADMIN_PASSWORD"
echo ""

# Generate CORS_ORIGINS
echo "Configure CORS origins:"
echo "Example: https://myapp.vercel.app,https://example.com"
read -p "Enter CORS_ORIGINS: " CORS_ORIGINS

echo ""
echo "📋 Environment Variables Summary"
echo "=================================="
echo ""
echo "Add these to Vercel dashboard (Settings → Environment Variables):"
echo ""
cat << EOF

# Copy and paste into Vercel dashboard:

MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/cdxi_os?retryWrites=true&w=majority
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY_DAYS=7
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=$ADMIN_PASSWORD
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
ANTHROPIC_API_KEY=sk-ant-...
CORS_ORIGINS=$CORS_ORIGINS
NEXT_PUBLIC_API_URL=https://your-app.vercel.app

EOF

echo ""
echo "🔒 Security Notes"
echo "=================="
echo "1. JWT_SECRET: Keep this secret! Don't commit to git."
echo "2. ADMIN_PASSWORD: Change this after first login."
echo "3. API Keys: Use test keys for development, live keys for production."
echo "4. Never log or share secrets."
echo ""

# Option to save to file
read -p "Save secrets to file? (y/n) [default: n]: " save_file

if [ "$save_file" = "y" ]; then
  OUTPUT_FILE=".env.secrets.txt"
  cat > "$OUTPUT_FILE" << EOF
# Generated: $(date)
# ⚠️ KEEP THIS FILE SECURE - DO NOT COMMIT TO GIT

MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/cdxi_os?retryWrites=true&w=majority
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY_DAYS=7
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=$ADMIN_PASSWORD
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
ANTHROPIC_API_KEY=sk-ant-...
CORS_ORIGINS=$CORS_ORIGINS
NEXT_PUBLIC_API_URL=https://your-app.vercel.app
EOF
  
  chmod 600 "$OUTPUT_FILE"
  echo "✓ Secrets saved to $OUTPUT_FILE (chmod 600)"
  echo "⚠️ Add to .gitignore if not already there"
  echo ""
  echo "To use: cat .env.secrets.txt | grep JWT_SECRET"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Create MongoDB Atlas cluster and get connection string"
echo "2. Get Anthropic API key from console.anthropic.com"
echo "3. Add environment variables to Vercel dashboard"
echo "4. Deploy: vercel deploy --prod"
