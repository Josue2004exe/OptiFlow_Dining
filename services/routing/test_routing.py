from main import shortest,route,RouteRequest

def test_normal_path():
    result=route(RouteRequest(origin='cocina',destination='mesa08',zone_levels={'C':'normal'}))
    assert result['path'][0]=='0,2' and result['path'][-1]=='4,3'
    assert result['distance']==5

def test_reroute_avoids_nodes():
    result=route(RouteRequest(origin='cocina',destination='mesa08',zone_levels={'C':'critica'},avoid_congestion=True))
    assert not result['congested']
    assert not set(result['path']) & {'2,2','3,2'}

def test_invalid_destination():
    from fastapi import HTTPException
    try:
        route(RouteRequest(destination='mesa99'))
        assert False
    except HTTPException as exc:
        assert exc.status_code==400
