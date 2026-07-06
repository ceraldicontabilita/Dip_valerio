FROM nginx:alpine
COPY ceraldi_presenze.html /usr/share/nginx/html/index.html
EXPOSE 80
