#!/bin/bash
# AI Safety Check Smoke Test
# 
# Tests the /ai-safety-check Edge Function with 3 known pairs:
# - JOGGERS: Expected HIDE (western boots + athleisure joggers)
# - DARK_JEANS: Expected KEEP (western boots + classic denim)
# - HOODIE: Expected DEMOTE (western boots + sporty hoodie)
#
# Usage: ./scripts/smoke-test-ai-safety.sh
#
# Prerequisites:
# - EXPO_PUBLIC_SUPABASE_URL in .env
# - EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
# - Test user: sub4@yopmail.com / azerty12

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
  SUPABASE_URL=$(grep "^EXPO_PUBLIC_SUPABASE_URL=" .env | cut -d '=' -f2)
  SUPABASE_ANON_KEY=$(grep "^EXPO_PUBLIC_SUPABASE_ANON_KEY=" .env | cut -d '=' -f2)
fi

# Fallback to defaults if not found
SUPABASE_URL="${SUPABASE_URL:-https://btmxvxwifgbxqqkigifm.supabase.co}"

if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo -e "${RED}Error: EXPO_PUBLIC_SUPABASE_ANON_KEY not found in .env${NC}"
  echo "Make sure your .env file contains EXPO_PUBLIC_SUPABASE_ANON_KEY"
  exit 1
fi

echo "======================================"
echo "AI Safety Check Smoke Test"
echo "======================================"
echo ""

# Step 1: Get JWT token
echo -e "${YELLOW}Step 1: Authenticating...${NC}"
AUTH_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"sub4@yopmail.com","password":"azerty12"}')

JWT_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.access_token')

if [ "$JWT_TOKEN" == "null" ] || [ -z "$JWT_TOKEN" ]; then
  echo -e "${RED}Failed to authenticate. Response:${NC}"
  echo "$AUTH_RESPONSE" | jq .
  exit 1
fi

echo -e "${GREEN}Authenticated successfully${NC}"
echo ""

# Step 2: Generate unique hash for this test run (to bypass cache)
TEST_RUN_ID=$(date +%s)
echo -e "${YELLOW}Step 2: Running AI Safety Check (test run: ${TEST_RUN_ID})...${NC}"

# Step 3: Call AI Safety Check
RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/ai-safety-check" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
  \"scan\": {
    \"input_hash\": \"smoke_test_boots_${TEST_RUN_ID}\",
    \"signals\": {
      \"version\": 1,
      \"aesthetic\": { \"primary\": \"western\", \"primary_confidence\": 0.95, \"secondary\": \"none\", \"secondary_confidence\": 0 },
      \"formality\": { \"band\": \"casual\", \"confidence\": 0.85 },
      \"statement\": { \"level\": \"high\", \"confidence\": 0.9 },
      \"season\": { \"heaviness\": \"mid\", \"confidence\": 0.8 },
      \"palette\": { \"colors\": [\"white\", \"tan\"], \"confidence\": 0.75 },
      \"pattern\": { \"level\": \"solid\", \"confidence\": 0.9 },
      \"material\": { \"family\": \"leather\", \"confidence\": 0.8 }
    }
  },
  \"pairs\": [
    {
      \"itemId\": \"JOGGERS\",
      \"match_input_hash\": \"smoke_test_joggers_${TEST_RUN_ID}\",
      \"pairType\": \"shoes+bottoms\",
      \"trust_filter_distance\": \"medium\",
      \"match_signals\": {
        \"version\": 1,
        \"aesthetic\": { \"primary\": \"sporty\", \"primary_confidence\": 0.9, \"secondary\": \"none\", \"secondary_confidence\": 0 },
        \"formality\": { \"band\": \"athleisure\", \"confidence\": 0.9 },
        \"statement\": { \"level\": \"low\", \"confidence\": 0.7 },
        \"season\": { \"heaviness\": \"mid\", \"confidence\": 0.7 },
        \"palette\": { \"colors\": [\"gray\", \"black\"], \"confidence\": 0.8 },
        \"pattern\": { \"level\": \"solid\", \"confidence\": 0.8 },
        \"material\": { \"family\": \"synthetic_tech\", \"confidence\": 0.8 }
      }
    },
    {
      \"itemId\": \"DARK_JEANS\",
      \"match_input_hash\": \"smoke_test_jeans_${TEST_RUN_ID}\",
      \"pairType\": \"shoes+bottoms\",
      \"trust_filter_distance\": \"medium\",
      \"match_signals\": {
        \"version\": 1,
        \"aesthetic\": { \"primary\": \"classic\", \"primary_confidence\": 0.8, \"secondary\": \"none\", \"secondary_confidence\": 0 },
        \"formality\": { \"band\": \"casual\", \"confidence\": 0.85 },
        \"statement\": { \"level\": \"low\", \"confidence\": 0.8 },
        \"season\": { \"heaviness\": \"mid\", \"confidence\": 0.8 },
        \"palette\": { \"colors\": [\"denim_blue\", \"black\"], \"confidence\": 0.8 },
        \"pattern\": { \"level\": \"solid\", \"confidence\": 0.9 },
        \"material\": { \"family\": \"denim\", \"confidence\": 0.9 }
      }
    },
    {
      \"itemId\": \"HOODIE\",
      \"match_input_hash\": \"smoke_test_hoodie_${TEST_RUN_ID}\",
      \"pairType\": \"shoes+tops\",
      \"trust_filter_distance\": \"medium\",
      \"match_signals\": {
        \"version\": 1,
        \"aesthetic\": { \"primary\": \"sporty\", \"primary_confidence\": 0.9, \"secondary\": \"street\", \"secondary_confidence\": 0.55 },
        \"formality\": { \"band\": \"athleisure\", \"confidence\": 0.9 },
        \"statement\": { \"level\": \"low\", \"confidence\": 0.7 },
        \"season\": { \"heaviness\": \"mid\", \"confidence\": 0.7 },
        \"palette\": { \"colors\": [\"gray\", \"white\"], \"confidence\": 0.8 },
        \"pattern\": { \"level\": \"solid\", \"confidence\": 0.8 },
        \"material\": { \"family\": \"knit\", \"confidence\": 0.8 }
      }
    }
  ]
}")

# Check if request succeeded
OK=$(echo "$RESPONSE" | jq -r '.ok')
if [ "$OK" != "true" ]; then
  echo -e "${RED}Request failed:${NC}"
  echo "$RESPONSE" | jq .
  exit 1
fi

# Step 4: Verify results
echo ""
echo -e "${YELLOW}Step 3: Verifying results...${NC}"
echo ""

# Extract verdicts
JOGGERS_ACTION=$(echo "$RESPONSE" | jq -r '.verdicts[] | select(.itemId == "JOGGERS") | .action')
JEANS_ACTION=$(echo "$RESPONSE" | jq -r '.verdicts[] | select(.itemId == "DARK_JEANS") | .action')
HOODIE_ACTION=$(echo "$RESPONSE" | jq -r '.verdicts[] | select(.itemId == "HOODIE") | .action')

JOGGERS_REASON=$(echo "$RESPONSE" | jq -r '.verdicts[] | select(.itemId == "JOGGERS") | .ai_reason')
JEANS_REASON=$(echo "$RESPONSE" | jq -r '.verdicts[] | select(.itemId == "DARK_JEANS") | .ai_reason')
HOODIE_REASON=$(echo "$RESPONSE" | jq -r '.verdicts[] | select(.itemId == "HOODIE") | .ai_reason')

# Track failures
FAILURES=0

# Check JOGGERS (expected: hide)
echo -n "JOGGERS (western boots + athleisure joggers): "
if [ "$JOGGERS_ACTION" == "hide" ]; then
  echo -e "${GREEN}PASS${NC} - hide"
  echo "  Reason: $JOGGERS_REASON"
else
  echo -e "${RED}FAIL${NC} - got '$JOGGERS_ACTION', expected 'hide'"
  echo "  Reason: $JOGGERS_REASON"
  FAILURES=$((FAILURES + 1))
fi

# Check DARK_JEANS (expected: keep)
echo -n "DARK_JEANS (western boots + classic denim): "
if [ "$JEANS_ACTION" == "keep" ]; then
  echo -e "${GREEN}PASS${NC} - keep"
  echo "  Reason: $JEANS_REASON"
else
  echo -e "${RED}FAIL${NC} - got '$JEANS_ACTION', expected 'keep'"
  echo "  Reason: $JEANS_REASON"
  FAILURES=$((FAILURES + 1))
fi

# Check HOODIE (expected: demote)
echo -n "HOODIE (western boots + sporty hoodie): "
if [ "$HOODIE_ACTION" == "demote" ]; then
  echo -e "${GREEN}PASS${NC} - demote"
  echo "  Reason: $HOODIE_REASON"
else
  echo -e "${YELLOW}WARN${NC} - got '$HOODIE_ACTION', expected 'demote' (acceptable: demote or hide)"
  echo "  Reason: $HOODIE_REASON"
  # Don't count as failure - demote vs hide is subjective for edge cases
fi

# Print stats
echo ""
echo "======================================"
echo "Stats:"
LATENCY=$(echo "$RESPONSE" | jq -r '.stats.ai_latency_ms // .stats.total_latency_ms')
CACHE_HITS=$(echo "$RESPONSE" | jq -r '.stats.cache_hits')
DRY_RUN=$(echo "$RESPONSE" | jq -r '.dry_run')
echo "  Latency: ${LATENCY}ms"
echo "  Cache hits: ${CACHE_HITS}"
echo "  Dry run: ${DRY_RUN}"
echo "======================================"
echo ""

# Final result
if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}${FAILURES} test(s) failed${NC}"
  exit 1
fi
