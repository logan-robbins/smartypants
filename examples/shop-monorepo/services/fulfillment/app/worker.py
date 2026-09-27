import json, os
import boto3, psycopg2
from kafka import KafkaConsumer

consumer = KafkaConsumer("orders.placed", bootstrap_servers=os.environ["KAFKA_BROKERS"])
db = psycopg2.connect(os.environ["DATABASE_URL"])
s3 = boto3.client("s3")

for message in consumer:
    order = json.loads(message.value)
    with db.cursor() as cur:
        cur.execute("UPDATE orders SET status = 'packed' WHERE id = %s", (order["orderId"],))
    db.commit()
    s3.put_object(Bucket=os.environ["INVOICE_BUCKET"], Key=f"invoices/{order['orderId']}.pdf", Body=b"...")
