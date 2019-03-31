FROM python:3.7-alpine

RUN apk update && \
    apk -U upgrade && \
    apk add \
        bash \
        nginx \
        supervisor && \
        mkdir /run/nginx  && \
        mkdir /var/log/gunicorn

COPY ./src /app
COPY ./requirements.txt /app/requirements.txt

RUN pip install --upgrade pip && \
    pip install -r /app/requirements.txt && \
    pip install gunicorn

COPY ./docker/nginx.conf /etc/nginx/nginx.conf
COPY ./docker/supervisord.conf /etc/supervisord/supervisord.conf

EXPOSE 8000

WORKDIR /app

ENV PYTHONPATH=/app

ENTRYPOINT ["supervisord", "-c", "/etc/supervisord/supervisord.conf"]