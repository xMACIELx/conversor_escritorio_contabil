FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY dominio-totvs/ /usr/share/nginx/html/dominio-totvs/
COPY ponto-dominio/ /usr/share/nginx/html/ponto-dominio/
COPY conferencia-ncm-cst/ /usr/share/nginx/html/conferencia-ncm-cst/

EXPOSE 80
