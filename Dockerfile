FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY dominio-totvs/ /usr/share/nginx/html/dominio-totvs/
COPY ponto-dominio/ /usr/share/nginx/html/ponto-dominio/

EXPOSE 80
