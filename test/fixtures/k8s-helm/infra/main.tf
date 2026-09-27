resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}
resource "aws_subnet" "private" {
  vpc_id = aws_vpc.main.id
}
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.0.0"
}
