#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Provides main endpoint for blockchain frontend."""

from flask import Flask, render_template

app = Flask(__name__)
app.config.from_pyfile('settings.cfg')


@app.route('/', methods=['get'])
def index():
    return render_template(
        'index.html',
        queue_router_host=app.config.get('QUEUE_ROUTER_HOST'),
        validation_service_host=app.config.get('VALIDATION_SERVICE_HOST'),
        validation_service_port=app.config.get('VALIDATION_SERVICE_PORT'),
        about_text= app.config.get('ABOUT_TEXT'),
    )


if __name__ == '__main__':
    app.run(port=8000)
