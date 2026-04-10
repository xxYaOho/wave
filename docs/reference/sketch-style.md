图层完整属性

```json
{
  "name": "test",
  "type": "Artboard",
  "frame": {
    "x": 131,
    "y": -1478,
    "width": 476,
    "height": 476
  },
  "opacity": 1,
  "fills": [
    {
      "fillType": "Color",
      "color": "#ffffffff",
      "enabled": true,
      "gradient": {
        "stops": [
          {
            "color": "#ffffffff",
            "position": 0
          },
          {
            "color": "#000000ff",
            "position": 1
          }
        ]
      }
    }
  ],
  "borders": [],
  "shadows": [],
  "innerShadows": [],
  "corners": {
    "style": 0,
    "radii": []
  },
  "blurs": [
    {
      "blurType": "Gaussian",
      "radius": 10,
      "enabled": true
    }
  ]
}
```

图层完整属性 (背景模糊)

```json
{
  "name": "test",
  "type": "Artboard",
  "frame": {
    "x": 133,
    "y": -1478,
    "width": 472,
    "height": 472
  },
  "opacity": 1,
  "blendingMode": "Normal",
  "fills": [
    {
      "fillType": "Color",
      "color": "#ffffffff",
      "enabled": false, // 注意：此填充已被取消勾选
      "gradient": {
        "gradientType": "Linear",
        "stops": [
          {
            "color": "#ffffffff",
            "position": 0
          },
          {
            "color": "#000000ff",
            "position": 1
          }
        ]
      }
    }
  ],
  "borders": [],
  "shadows": [],
  "innerShadows": [],
  "corners": {
    "style": 0,
    "radii": [],
    "concentric": false
  },
  "blurs": [
    {
      "blurType": "Background", // 注意：模糊类型从 Gaussian 变更为 Background Blur
      "radius": 10,
      "enabled": true
    }
  ],
  "masksSiblings": false,
  "maskMode": 0
}
```

文本图层属性

```json
{
  "name": "test-text",
  "type": "Text",
  "text": "test-text",
  "frame": {
    "x": 818,
    "y": 872,
    "width": 67,
    "height": 22
  },
  "sharedStyleId": null,
  "style": {
    "opacity": 1,
    "textColor": "#000000ff",
    "fontSize": 16,
    "lineHeight": null,
    "fontWeight": 5, // 代表 Regular
    "fontFamily": "PingFang SC",
    "fontAxes": null,
    "alignment": "left",
    "kerning": null,
    "paragraphSpacing": 0,
    "textTransform": "none",
    "verticalAlignment": "top",
    "textColorName": null,
    "sharedStyleName": null
  }
}
```
