from fastapi import APIRouter, FastAPI
router = APIRouter()
app = FastAPI()

@router.post("/entries")
def add(): ...
