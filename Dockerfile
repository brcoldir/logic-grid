# Stage 1: Build the Go app
FROM golang:1.25 AS builder
WORKDIR /app

# Copy module files and download deps
COPY go.mod ./
RUN go mod download

# Copy the rest of the source
COPY . .

# Enable CGO so mattn/go-sqlite3 builds correctly
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o app ./...

# Stage 2: Minimal runtime
FROM gcr.io/distroless/base-debian12
WORKDIR /app

# Copy binary
COPY --from=builder /app/app .

# Copy static folder into runtime image
COPY --from=builder /app/static ./static

# (Optional but nice) document the port
EXPOSE 8080

# Run app
CMD ["./app"]
