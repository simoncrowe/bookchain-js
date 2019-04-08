FROM python:3.7-alpine

RUN apk update && \
    apk -U upgrade && \
    apk add \
        bash \
        supervisor && \
        mkdir /var/log/gunicorn

COPY ./src /app
COPY ./requirements.txt /app/requirements.txt

RUN pip install --upgrade pip && \
    pip install -r /app/requirements.txt && \
    pip install gunicorn

COPY ./docker/supervisord.conf /etc/supervisord/supervisord.conf

EXPOSE 6006

WORKDIR /app

ENV PYTHONPATH=/app

ENTRYPOINT ["supervisord", "-c", "/etc/supervisord/supervisord.conf"]
