#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Provides endpoints for routing app."""

from uuid import uuid4

from flask import Flask, render_template

app = Flask(__name__)


@app.route('/', methods=['get'])
def register():
    return render_template(
        template_name_or_list='index.html',
        queue_router_ip=app.config.get('queue_router_ip'),
        queue_router_port=app.config.get('queue_router_port'),
    )


if __name__ == '__main__':
    app.run(port=8000)
