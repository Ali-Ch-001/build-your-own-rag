import orjson

from rag_platform.api.responses import sse


def test_sse_frame_contains_id_event_and_json_data() -> None:
    payload = {"event_id": "rsp:1", "type": "token", "data": {"delta": "hello"}}
    frame = sse("token", payload)
    assert frame.startswith(b"id: rsp:1\nevent: token\ndata: ")
    encoded = frame.split(b"data: ", 1)[1].strip()
    assert orjson.loads(encoded) == payload
