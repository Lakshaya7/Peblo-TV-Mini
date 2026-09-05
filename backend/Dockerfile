FROM python:3.14-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt ./
RUN pip3 install --break-system-packages -r requirements.txt

# Copy the backend package (build context is ./backend)
COPY . /app/backend

# Create directories used at runtime
RUN mkdir -p /storage /catalogue

EXPOSE 8000

# Run the app (locates the backend package at /app/backend)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]