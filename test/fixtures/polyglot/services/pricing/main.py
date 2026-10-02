from flask import Flask
app = Flask(__name__)

@app.route("/price")
def price():
    return "1"
