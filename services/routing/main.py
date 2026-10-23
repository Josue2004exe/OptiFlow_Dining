"""Microservicio independiente de ruteo: Dijkstra y congestión por zonas."""
from collections import deque
from heapq import heappop,heappush
from pathlib import Path
import json
from fastapi import FastAPI,HTTPException
from pydantic import BaseModel, Field

app=FastAPI(title='OptiFlow · Ruteo operativo',version='1.0.0')
CONFIG_PATH = Path('/app/config/salon.json') if Path('/app/config/salon.json').exists() else Path(__file__).resolve().parents[2]/'config'/'salon.json'
LAYOUT=json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
ORIGINS={o['id']:o['node'] for o in LAYOUT['origins']}
TABLES={t['id']:t['node'] for t in LAYOUT['tables']}
WIDTH=LAYOUT['columns']
HEIGHT=LAYOUT['rows']
CONGESTION=set(LAYOUT['demo_congestion_nodes'])

class RouteRequest(BaseModel):
    origin:str='cocina'
    destination:str='mesa08'
    task_type:str='entrega'
    avoid_congestion:bool=False
    zone_levels:dict[str,str]=Field(default_factory=dict)


def neighbors(node):
    x,y=map(int,node.split(','))
    # En empates favorecemos circulación horizontal por pasillo principal.
    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx,ny=x+dx,y+dy
        if 0<=nx<WIDTH and 0<=ny<HEIGHT:
            yield f'{nx},{ny}'


def shortest(start,end,avoid_nodes):
    if start==end: return [start]
    heap=[(0,0,start)]
    previous={}
    best={start:0}
    serial=1
    while heap:
        cost,_,u=heappop(heap)
        if cost!=best[u]:continue
        if u==end:break
        for v in neighbors(u):
            if v in avoid_nodes and v!=end:continue
            # Preferimos nodos del pasillo central (y=2) a igualdad de distancia.
            penalty=0.001 if int(v.split(',')[1])!=2 else 0
            candidate=cost+1+penalty
            if candidate<best.get(v,float('inf')):
                best[v]=candidate
                previous[v]=u
                heappush(heap,(candidate,serial,v))
                serial+=1
    if end not in best:return None
    path=[end]
    while path[-1]!=start:path.append(previous[path[-1]])
    return list(reversed(path))


@app.get('/health')
def health():return {'status':'ok','service':'routing'}


@app.get('/layout')
def layout():return LAYOUT


@app.post('/route')
def route(request:RouteRequest):
    if request.origin not in ORIGINS or request.destination not in TABLES:
        raise HTTPException(status_code=400,detail='Origen o mesa no disponibles')
    if request.task_type not in ('entrega','retiro'):
        raise HTTPException(status_code=400,detail='Tipo de servicio inválido')
    start=ORIGINS[request.origin]
    end=TABLES[request.destination]
    has_congestion=any(request.zone_levels.get(zone)=='critica' for zone in ('B','C'))
    risky=CONGESTION if has_congestion else set()
    path=shortest(start,end,risky if request.avoid_congestion else set())
    if path is None:
        raise HTTPException(status_code=404,detail='No se encontró una ruta disponible. Recalcular o volver al panel.')
    crossed=sorted(set(path)&risky)
    return {'origin':request.origin,'destination':request.destination,'path':path,'distance':len(path)-1,
            'congested':bool(crossed),'congested_nodes':crossed,'alternative':request.avoid_congestion,
            'notice':('Ruta alternativa para evitar los nodos congestionados.' if request.avoid_congestion else
                      'Se detectó congestión en el trayecto: puedes recalcular la ruta.' if crossed else
                      'Ruta recomendada disponible, sin congestión en el trayecto.')}
