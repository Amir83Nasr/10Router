docker stop 10router
docker rm 10router
docker build -t 10router .
docker run -d --name 10router -p 20128:20128 --env-file .env -v 10router-data:/app/data 10router