# Base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your app
COPY . .

# Expose the port your server uses
EXPOSE 3000

# Start the backend (assuming entry point is server/index.js)
CMD ["node", "server/index.js"]
