# Legacy container sketch: references the removed NestJS backend.
# Not a TalaTrace 1.2.0 build/deployment path; see AUDIT_REPORT.md.
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git cmake

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --only=production
RUN cd backend && npm ci
RUN cd frontend && npm ci

# Copy source code
COPY . .

# Build the application
RUN cd backend && npm run build
RUN cd frontend && npm run build

# Production stage
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy built application
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/models ./models
COPY --from=builder /app/native ./native

# Create upload directory
RUN mkdir -p /app/uploads

# Expose ports
EXPOSE 3333 4200

# Start the backend server
CMD ["node", "backend/dist/main.js"]
