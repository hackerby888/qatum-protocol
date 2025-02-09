{
  "targets": [
    {
      "target_name": "q",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ "./cpp/q.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
      "cflags": [
          "-mrdrnd -mbmi -mavx2 -fpermissive -w",
      ]
    }
  ]
}